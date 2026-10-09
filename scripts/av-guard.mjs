#!/usr/bin/env node
/**
 * T-AV0, Step 5. The one command that answers "is it safe to run this here".
 *
 *   npm run av:guard          # standalone
 *   node scripts/av-guard.mjs --db     # db/seed context: prod URL is fatal
 *
 * Wired as `predev:av`, `pretest`, `pretest:complete`, and inside every
 * `db:*` / `av:*` script. Also run by .githooks/pre-push. T-AV0's hard line
 * says to run it before every migration, db script, dev start and push -- so
 * it is wired into those four places rather than left as a thing to remember.
 * A rule that depends on remembering fails on the day you are busy; this repo
 * has paid for that lesson with three duplicate migration numbers.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IT REFUSES (T-AV0 Step 5, verbatim)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. the branch is `main`, or is not athlete/*, feat/t-av*, fix/t-av*
 *   2. av-migration-check fails
 *   3. the active env points at the production Supabase URL while a db:* or
 *      seed script is running
 *   4. PUSH_MODE or EMAIL_MODE is not `log`
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SCOPE: RULES 1 AND 4 APPLY TO BRANCHES THAT TOUCH THE PROGRAM (2026-10-09)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Al's instruction, written, after this blocked two unrelated tickets in two
 * days. It is the escape hatch the failure message names -- "if this is
 * blocking legitimate work, STOP and tell Al" -- taken rather than worked
 * around, and it is recorded here because the next person to read that
 * sentence needs to know it was followed.
 *
 * The problem was the TRIGGER, not the rules. Rules 1 and 4 exist so athlete
 * work cannot run against production or send for real; `test:complete` on a
 * branch that does not touch a single athlete file can do neither. Blocking it
 * anyway taught the one lesson a guard must never teach -- that the way past
 * it is to stop running it -- and `npm run test:complete` is the ONLY command
 * that checks the suite actually ran every file on disk, so the guard was
 * costing exactly the coverage check it had no stake in.
 *
 * So in a TEST context, on a branch whose diff against main contains no
 * athlete-program file, rules 1 and 4 are skipped and the reason is printed.
 *
 * WHAT DOES NOT CHANGE, and the distinction is the whole safety of this:
 *   - `--db`, `db:*` and `av:seed` are never relaxed. Rule 3 is untouched.
 *   - `predev:av` and the pre-push hook are never relaxed.
 *   - A branch that DOES touch an athlete file gets every rule, as before.
 *   - If the scope cannot be computed -- no merge base, detached HEAD, git
 *     failure -- it FAILS CLOSED and applies the full rules. A guard that
 *     cannot tell whether it is in scope must assume it is; the alternative is
 *     a check that goes quiet for the same reason it would go wrong.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT PRINTS WHAT IT READ, NOT ONLY THAT IT PASSED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The success line carries the branch, the migration count, which database it
 * resolved and where the env values came from. A check that emits only "OK" is
 * unfalsifiable from outside -- CLAUDE.md records a guard that read nothing at
 * all and reported PASS to three separate instruments, caught only because one
 * of them printed its extracted value and a human read `(none)`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AN UNSET PUSH_MODE IS A FAILURE, NOT A PASS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Absent is not `log`. Defaulting an unset variable to the safe value would
 * make the guard quiet in exactly the state it exists to catch: a shell with
 * no env file loaded, which is also the shell where a send path would use its
 * own production default. So unset fails, and the message says where to set it.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readEnvFile } from './envFile.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');

// T-AV19: rule 4 asks lib/notify/sendMode.ts, the module the app itself asks,
// rather than re-implementing "is this log mode" in a script. It is a .ts
// file, so re-exec once with type stripping, the same as av-migration-check.
if (!process.features.typescript) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', SELF, ...process.argv.slice(2)],
    { stdio: 'inherit' }
  );
  process.exit(r.status ?? 1);
}
const { resolveSendMode } = await import(path.join(ROOT, 'lib', 'notify', 'sendMode.ts'));

/** Branches this program is allowed to run on. `main` is never one of them. */
const ALLOWED = [/^athlete\//, /^feat\/t-av/i, /^fix\/t-av/i];

/**
 * Paths that ARE the athlete-value program. A branch touching any of these is
 * in scope for the full rules whatever it is called.
 *
 * Every entry carries its reason, because an exemption list without reasons
 * cannot be audited and this is that list read from the other side -- the
 * entries here are what KEEPS the guard on, so a missing one silently turns it
 * off. CLAUDE.md's rule: read an allow-list for missing comments first.
 */
const ATHLETE_PATHS = [
  ['app/atletas/', 'the athlete-facing surfaces themselves'],
  ['app/admin/atletas/', 'the admin side of the same program'],
  ['app/api/atletas/', 'its API routes'],
  ['lib/atletas/', 'its DAL and notification helpers'],
  ['app/pase/verificar/', 'the door flow; calls av_confirm_pass_attendance'],
  ['scripts/av-', 'the program tooling, including this guard'],
  ['.env.av', 'the env files whose modes rules 1 and 4 are about'],
  ['lib/notify/sendMode.ts', 'the module rule 4 resolves through'],
  ['supabase/av-', 'the local-stack schema snapshot'],
];

/**
 * A migration belonging to the program. The series names its ticket --
 * `202_t_av22_athlete_programs.sql` -- so the convention is the detector, and
 * it is anchored on the `_t_av` infix rather than a number range, which would
 * go stale the moment the next migration lands.
 */
const ATHLETE_MIGRATION = /^supabase\/migrations\/.*_t_av\d/i;

/**
 * Which files this branch changes relative to main.
 *
 * Returns null -- NOT an empty list -- when it cannot tell. An empty list
 * means "nothing athlete-related changed" and relaxes the guard; null means
 * "unknown" and must not. Collapsing the two is the bug this shape exists to
 * prevent, and it is the same shape as a watcher that reports a missing field
 * as a value that looks like waiting.
 */
function changedFiles() {
  const base = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: ROOT, encoding: 'utf8' });
  if (base.status !== 0 || !(base.stdout ?? '').trim()) return null;
  const diff = spawnSync('git', ['diff', '--name-only', `${base.stdout.trim()}...HEAD`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (diff.status !== 0) return null;
  const committed = (diff.stdout ?? '').split('\n').filter(Boolean);
  // Uncommitted work counts too: the files are what the test run will load,
  // and whether they happen to be committed yet says nothing about scope.
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  if (dirty.status !== 0) return null;
  const working = (dirty.stdout ?? '')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).trim())
    .flatMap((l) => (l.includes(' -> ') ? l.split(' -> ') : [l]));
  return [...new Set([...committed, ...working])];
}

/** The athlete-program files in a change set, for printing. */
function athleteFilesIn(files) {
  return files.filter(
    (f) => ATHLETE_MIGRATION.test(f) || ATHLETE_PATHS.some(([prefix]) => f.startsWith(prefix))
  );
}

/**
 * Env files consulted, nearest-wins, after the real process environment.
 * `.env.av.local` is the worktree's own (gitignored by `.env*.local`);
 * `.env.local` is last because it is main's file and may well point at
 * production, which is precisely the state rule 3 exists to catch.
 *
 * `.env.av.example` is deliberately NOT in this list. It is a committed
 * template holding safe values, so consulting it would mean the guard always
 * found PUSH_MODE=log and a localhost URL -- it would report `db=local` for a
 * shell whose app is reading `.env.local` and talking to production. A guard
 * must read the values the running command will read, not a tidier copy of
 * them.
 */
const ENV_FILES = ['.env.av.local', '.env.local'];

const argv = process.argv.slice(2);
const lifecycle = process.env.npm_lifecycle_event ?? '';
/**
 * "A db or seed script is running." Either the caller said so with --db, or
 * npm told us which script it is running. Both, because the pre-script form
 * (`predb:reset`) and the inline form (`node scripts/av-guard.mjs --db && ...`)
 * are both used and neither covers the other.
 */
const DB_CONTEXT =
  argv.includes('--db') || /^(pre)?(db:|av:seed|seed)/.test(lifecycle) || /seed/.test(lifecycle);

/**
 * A test run, and nothing else. `predev:av`, every `db:*`, `av:*` and the
 * pre-push hook are deliberately absent: this is the only context the scope
 * relaxation applies to, so the list is spelled out rather than inferred from
 * what is NOT a db context.
 */
const TEST_CONTEXT = /^(pre)?test(:complete)?$/.test(lifecycle);

/**
 * Scope: does this branch touch the athlete-value program at all?
 * null = could not tell = treat as in scope (fail closed).
 */
const changed = TEST_CONTEXT && !DB_CONTEXT ? changedFiles() : null;
const athleteTouched = changed === null ? null : athleteFilesIn(changed);
const OUT_OF_SCOPE = TEST_CONTEXT && !DB_CONTEXT && athleteTouched !== null && athleteTouched.length === 0;

const fail = (lines) => {
  console.error(`av-guard FAILED\n\n${lines.map((l) => `  - ${l}`).join('\n')}\n`);
  console.error(
    `  T-AV0's hard line: all athlete-value work lives on athlete/main and\n` +
      `  ticket branches cut from it, migrations run on the LOCAL stack only,\n` +
      `  and every send path is in log mode until Al orders the merge.\n` +
      `  If this is blocking legitimate work, STOP and tell Al -- do not edit\n` +
      `  the guard to get past it.\n`
  );
  process.exit(1);
};

// ── 1. branch ──────────────────────────────────────────────────────────────
const git = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  cwd: ROOT,
  encoding: 'utf8',
});
const branch = (git.stdout ?? '').trim();
const problems = [];

if (git.status !== 0 || branch === '') {
  // Not skippable: an unreadable branch is the "cannot tell" case, and the
  // scope detector needs the same git that just failed.
  problems.push(`could not read the current branch (git said: ${(git.stderr ?? '').trim()})`);
} else if (branch === 'main') {
  // NEVER relaxed. main is not a place this program is built, whatever the
  // diff looks like, and a green test run on main is not worth the exception.
  problems.push(`branch is "main". Nothing in this program is built on main.`);
} else if (!OUT_OF_SCOPE && !ALLOWED.some((re) => re.test(branch))) {
  problems.push(
    `branch "${branch}" is not athlete/*, feat/t-av* or fix/t-av*. ` +
      `Cut the ticket branch from athlete/main.`
  );
}

// ── 2. migrations ──────────────────────────────────────────────────────────
const mig = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'av-migration-check.mjs')], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (mig.status !== 0) {
  problems.push(`av-migration-check failed:\n${(mig.stderr || mig.stdout || '').trim()}`);
}
const migCount = /OK: (\d+) migration/.exec(mig.stdout ?? '')?.[1] ?? '?';

// ── env resolution ─────────────────────────────────────────────────────────
/** Returns { value, source } so the success line can say where a value came from. */
function resolve(key) {
  if (process.env[key] !== undefined && process.env[key] !== '') {
    return { value: process.env[key], source: 'process.env' };
  }
  for (const f of ENV_FILES) {
    const v = readEnvFile(path.join(ROOT, f))[key];
    if (v !== undefined && v !== '') return { value: v, source: f };
  }
  return { value: undefined, source: 'unset' };
}

// ── 3. which database ──────────────────────────────────────────────────────
const url = resolve('NEXT_PUBLIC_SUPABASE_URL');
let host = '';
try {
  host = url.value ? new URL(url.value).hostname : '';
} catch {
  problems.push(`NEXT_PUBLIC_SUPABASE_URL is not a URL: "${url.value}" (from ${url.source})`);
}
const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
const db = url.value === undefined ? 'unset' : isLocal ? 'local' : 'prod-readonly';

if (DB_CONTEXT && db !== 'local') {
  problems.push(
    `a db/seed script is running (npm_lifecycle_event="${lifecycle || 'none'}") but ` +
      `NEXT_PUBLIC_SUPABASE_URL is ${url.value ?? 'unset'} (from ${url.source}). ` +
      `Pre-merge, migrations and seeds run against the LOCAL stack only.`
  );
}

// ── 4. send modes ──────────────────────────────────────────────────────────
// Two checks, and they answer different questions.
//
// 4a, the TEXT: the variable must literally be `log`. Unset fails here even
//     though sendMode would call it log on a localhost URL, because absent is
//     not log (see the header) and the env file is where the branch says so.
// 4b, the RESOLVED MODE: the value the app will actually act on, computed by
//     lib/notify/sendMode.ts from the same env the running command reads. If
//     the module and this script ever disagree about what "log" means, 4b is
//     the one that matches runtime, so it is the one that must not say live.
const modes = {};
for (const key of ['PUSH_MODE', 'EMAIL_MODE']) {
  const r = resolve(key);
  modes[key] = r;
  // Out of scope: a branch that changes no athlete file cannot send as one,
  // and a test run does not send at all. Still RESOLVED and printed below, so
  // the line says what the modes were even when they were not enforced.
  if (!OUT_OF_SCOPE && r.value !== 'log') {
    problems.push(
      `${key} is ${r.value === undefined ? 'unset' : `"${r.value}"`} (from ${r.source}); ` +
        `it must be "log" on this branch. Set it in .env.av.local.`
    );
  }
}

const runtimeEnv = {
  NEXT_PUBLIC_SUPABASE_URL: url.value,
  EMAIL_MODE: modes.EMAIL_MODE.value,
  PUSH_MODE: modes.PUSH_MODE.value,
};
const resolved = {
  email: resolveSendMode('email', runtimeEnv),
  push: resolveSendMode('push', runtimeEnv),
};
for (const channel of ['email', 'push']) {
  if (!OUT_OF_SCOPE && resolved[channel].mode !== 'log') {
    problems.push(
      `${channel} resolves to "${resolved[channel].mode}" (${resolved[channel].reason}) through ` +
        `lib/notify/sendMode.ts. Nothing on this branch may send for real.`
    );
  }
}

// A guard that enforces must say WHY it considers itself in scope, or the
// person reading the failure cannot tell a real block from a misfire. This is
// the same reason the success line prints its evidence.
if (problems.length > 0) {
  if (TEST_CONTEXT && !DB_CONTEXT) {
    if (athleteTouched === null) {
      problems.push(
        `scope: could not be computed (no merge base with origin/main, or git failed), ` +
          `so the full rules apply. This is deliberate -- the guard fails CLOSED.`
      );
    } else if (athleteTouched.length > 0) {
      problems.push(
        `scope: this branch changes ${athleteTouched.length} athlete-program file(s), ` +
          `so rules 1 and 4 apply: ${athleteTouched.join(', ')}`
      );
    }
  }
  fail(problems);
}

// The header's own rule: print what was READ, not only that it passed. When
// the guard relaxes, the line has to say so and say on what evidence, or a
// skipped check is indistinguishable from a passed one -- which is the exact
// failure this file's comments warn about twice.
const scope = OUT_OF_SCOPE
  ? ` scope=out-of-program(0 athlete files in ${changed.length} changed; rules 1+4 skipped)`
  : athleteTouched && athleteTouched.length > 0
    ? ` scope=in-program(${athleteTouched.length}: ${athleteTouched.slice(0, 3).join(', ')}${athleteTouched.length > 3 ? ', …' : ''})`
    : '';

console.log(
  `av-guard OK: branch=${branch} migrations=${migCount} db=${db} ` +
    `push=${resolved.push.mode}(${resolved.push.reason}) email=${resolved.email.mode}(${resolved.email.reason})` +
    `${scope}` +
    `  [url:${url.source} push:${modes.PUSH_MODE.source} email:${modes.EMAIL_MODE.source}` +
    `${DB_CONTEXT ? ' context:db' : ''}]`
);
