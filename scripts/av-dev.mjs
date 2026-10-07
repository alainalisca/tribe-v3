#!/usr/bin/env node
/**
 * `npm run dev:av` -- next dev on port 3001 with .env.av.local loaded.
 *
 * Why a launcher rather than `node --env-file=.env.av.local next dev`: Next
 * forwards its own node flags to the processes it spawns via NODE_OPTIONS, and
 * node refuses `--env-file` there. The dev server exited immediately with
 * "--env-file= is not allowed in NODE_OPTIONS".
 *
 * Why not rename the file to `.env.local` and let Next load it by itself:
 * because `.env.local` is main's filename. A worktree that reads `.env.local`
 * would silently pick up a production Supabase URL the day someone copies one
 * in, and av-guard would be checking a different file from the one the app
 * loaded. One filename, read by one parser, checked by the guard and used by
 * the server.
 *
 * Values already in the real environment WIN over the file, so a one-off
 * `ATHLETE_VALUE_ENABLED=all npm run dev:av` works for a flag experiment
 * without editing anything.
 */
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

// T-AV19: the send-mode check below asks lib/notify/sendMode.ts, the module
// the server asks. It is .ts, so re-exec once with type stripping. The flag
// applies to this launcher only; the `next dev` child is spawned as before.
if (!process.features.typescript) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit' }
  );
  process.exit(r.status ?? 1);
}
import { readEnvFile } from './envFile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env.av.local');

if (!existsSync(ENV_FILE)) {
  console.error(
    `dev:av FAILED: .env.av.local is missing.\n` +
      `  cp .env.av.example .env.av.local, then fill in the keys from\n` +
      `  \`npm run db:status\`. They are the local stack's keys, not production's.\n`
  );
  process.exit(1);
}

const fromFile = readEnvFile(ENV_FILE);
const env = { ...fromFile, ...process.env };

// T-AV19 Part B.3: refuse to start a server that would send for real. Checked
// against `env`, the exact object handed to `next dev`, so a live value
// exported in the shell (which wins over the file) is caught here too.
const { resolveSendMode } = await import(path.join(ROOT, 'lib', 'notify', 'sendMode.ts'));
for (const channel of ['email', 'push']) {
  const r = resolveSendMode(channel, env);
  if (r.mode !== 'log') {
    console.error(
      `dev:av FAILED: ${channel} resolves to "${r.mode}" (${r.reason}) for the server this would start.\n` +
        `  Set EMAIL_MODE=log and PUSH_MODE=log in .env.av.local, and unset any live value in the shell.\n`
    );
    process.exit(1);
  }
}

const port = process.env.PORT ?? '3001';
console.log(
  `dev:av -> next dev -p ${port}  [env: ${Object.keys(fromFile).length} keys from .env.av.local, ` +
    `supabase=${env.NEXT_PUBLIC_SUPABASE_URL}, flag=${env.ATHLETE_VALUE_ENABLED ?? 'unset'}]`
);

const child = spawn(
  process.execPath,
  [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', port],
  { cwd: ROOT, env, stdio: 'inherit' }
);
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
