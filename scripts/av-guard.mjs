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
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Branches this program is allowed to run on. `main` is never one of them. */
const ALLOWED = [/^athlete\//, /^feat\/t-av/i, /^fix\/t-av/i];

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
  problems.push(`could not read the current branch (git said: ${(git.stderr ?? '').trim()})`);
} else if (branch === 'main') {
  problems.push(`branch is "main". Nothing in this program is built on main.`);
} else if (!ALLOWED.some((re) => re.test(branch))) {
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
/** Minimal KEY=VALUE reader. No dependency: T-AV0's budget is $0 and no new npm package. */
function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

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
const modes = {};
for (const key of ['PUSH_MODE', 'EMAIL_MODE']) {
  const r = resolve(key);
  modes[key] = r;
  if (r.value !== 'log') {
    problems.push(
      `${key} is ${r.value === undefined ? 'unset' : `"${r.value}"`} (from ${r.source}); ` +
        `it must be "log" on this branch. Set it in .env.av.local.`
    );
  }
}

if (problems.length > 0) fail(problems);

console.log(
  `av-guard OK: branch=${branch} migrations=${migCount} db=${db} push=log email=log` +
    `  [url:${url.source} push:${modes.PUSH_MODE.source} email:${modes.EMAIL_MODE.source}` +
    `${DB_CONTEXT ? ' context:db' : ''}]`
);
