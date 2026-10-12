/**
 * av-guard ADDENDUM 2026-10-12: in a db or dev context, a branch that touches
 * no athlete-program file skips rule 1 (the branch name), and ONLY when the
 * database is local and PUSH_MODE and EMAIL_MODE are `log`.
 *
 * Al's instruction, written, 2026-10-12: "allow branches that touch no athlete
 * files to run db:*, av:seed and dev:av, only when the database is local and
 * PUSH_MODE and EMAIL_MODE are log."
 *
 * The decision is scripts/av-guard-scope.mjs, a pure function, so every
 * precondition is pinned here directly: each case below flips exactly one input
 * away from the relaxed state and asserts the branch rule comes back. The
 * subprocess cases then prove the guard knows which context it is in, which is
 * the input this all hangs on (the 2026-10-09 bug was a right rule behind a
 * wrong context).
 *
 * Mutation proof (run by hand): delete any one line of the `unmet` checks in
 * av-guard-scope.mjs and its case here goes red; drop `--dev` from predev:av
 * and the wiring case goes red.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { branchRuleRelaxation } from './av-guard-scope.mjs';

const ROOT = path.resolve(__dirname, '..');
const scripts: Record<string, string> = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;

type Input = Parameters<typeof branchRuleRelaxation>[0];

/** Every precondition met: the only state in which rule 1 is skipped. */
const RELAXED: Input = {
  context: 'db',
  athleteTouched: [],
  db: 'local',
  modeText: { push: 'log', email: 'log' },
  modeResolved: { push: 'log', email: 'log' },
};

describe('branchRuleRelaxation', () => {
  it.each(['db', 'dev'] as const)('relaxes rule 1 in a %s context when every precondition holds', (context) => {
    expect(branchRuleRelaxation({ ...RELAXED, context })).toEqual({ relaxed: true, reason: null });
  });

  it.each(['test', 'other'] as const)('is not consulted in a %s context', (context) => {
    expect(branchRuleRelaxation({ ...RELAXED, context })).toEqual({ relaxed: false, reason: null });
  });

  it('fails CLOSED when the scope could not be computed', () => {
    const r = branchRuleRelaxation({ ...RELAXED, athleteTouched: null });
    expect(r.relaxed).toBe(false);
    expect(r.reason).toMatch(/could not be computed/);
  });

  it('does not relax a branch that touches an athlete file, and names it', () => {
    const r = branchRuleRelaxation({ ...RELAXED, athleteTouched: ['app/atletas/page.tsx'] });
    expect(r.relaxed).toBe(false);
    expect(r.reason).toMatch(/app\/atletas\/page\.tsx/);
  });

  it.each(['prod-readonly', 'unset'] as const)('does not relax when the database is %s', (db) => {
    const r = branchRuleRelaxation({ ...RELAXED, db });
    expect(r.relaxed).toBe(false);
    expect(r.reason).toMatch(new RegExp(`database is ${db}`));
  });

  it.each([
    ['PUSH_MODE text', { modeText: { push: 'live', email: 'log' } }, /PUSH_MODE/],
    ['PUSH_MODE unset', { modeText: { push: undefined, email: 'log' } }, /PUSH_MODE/],
    ['PUSH_MODE resolved', { modeResolved: { push: 'live', email: 'log' } }, /PUSH_MODE/],
    ['EMAIL_MODE text', { modeText: { push: 'log', email: 'live' } }, /EMAIL_MODE/],
    ['EMAIL_MODE unset', { modeText: { push: 'log', email: undefined } }, /EMAIL_MODE/],
    ['EMAIL_MODE resolved', { modeResolved: { push: 'log', email: 'live' } }, /EMAIL_MODE/],
  ] as const)('does not relax when %s is not log', (_label, override, pattern) => {
    const r = branchRuleRelaxation({ ...RELAXED, ...override } as Input);
    expect(r.relaxed).toBe(false);
    expect(r.reason).toMatch(pattern);
  });
});

describe('av-guard is wired so it can see a db or dev run', () => {
  it('predev:av calls the guard directly, with --dev and never --test', () => {
    expect(scripts['predev:av']).toMatch(/^node scripts\/av-guard\.mjs\b.*--dev\b/);
    expect(scripts['predev:av']).not.toMatch(/--test\b/);
    expect(scripts['predev:av']).not.toMatch(/\bnpm run\b/);
  });

  it.each(['db:start', 'db:stop', 'db:status', 'db:reset', 'av:seed'])('%s runs the guard with --db first', (name) => {
    expect(scripts[name], `${name} missing`).toMatch(/^node scripts\/av-guard\.mjs --db && /);
  });
});

/** Same rule as avGuard.sendMode.test.ts (Node 22.6 for --experimental-strip-types). */
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

const contextOf = (out: string) => /context[=:](\w+)/.exec(out)?.[1] ?? null;

describe.skipIf(!nodeCanStripTypes(process.versions.node))('av-guard reports a dev context', () => {
  it('--dev is a dev run', () => {
    expect(contextOf(guard(['--dev'], ''))).toBe('dev');
  });

  it('npm lifecycle "predev:av" is a dev run without the flag (the second route)', () => {
    expect(contextOf(guard([], 'predev:av'))).toBe('dev');
  });

  it('--dev outranks --test: a dev server never gets the test relaxation', () => {
    expect(contextOf(guard(['--dev', '--test'], ''))).toBe('dev');
  });

  it('--db outranks --dev', () => {
    expect(contextOf(guard(['--db', '--dev'], ''))).toBe('db');
  });
});
