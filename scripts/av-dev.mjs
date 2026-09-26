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
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';
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
