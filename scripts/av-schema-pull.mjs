#!/usr/bin/env node
/**
 * T-AV0, Step 4.3. Build the LOCAL schema from PRODUCTION, schema only, no rows.
 *
 *   npm run av:schema:pull
 *
 * Writes supabase/av-local-schema.sql, which [db.seed] in supabase/config.toml
 * loads on every `supabase db reset`. Then reports drift against
 * supabase/schema.sql, the file in the repo that claims to describe the same
 * database. Production wins; the report exists so somebody knows.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A DUMP AND NOT A REPLAY OF supabase/migrations/
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Because the migrations do not add up to production. CLAUDE.md records that
 * `protect_verified_instructor()` is live, SECURITY DEFINER, and appears in no
 * migration in this repo, and that `public.users` has at least six policies in
 * production against two here. A database built by replaying this directory is
 * missing a security control, so testing a gate against it would produce a
 * confident pass about a system that does not exist.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS NEEDS, AND WHY IT MAY REFUSE TO RUN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `supabase db dump` runs pg_dump against the real database, so it needs a
 * connection, not just an API token. Measured 2026-09-25: the PAT at
 * ~/.supabase/access-token is missing the `projects_read` permission, so
 * `supabase projects list` and therefore `supabase link` both fail. Either
 * fixes it:
 *
 *   - a PAT with projects_read, plus the project's database password:
 *       supabase link --project-ref <ref>
 *       npm run av:schema:pull
 *   - or the direct connection string, which skips linking entirely:
 *       SUPABASE_DB_URL='postgresql://...' npm run av:schema:pull
 *
 * The token is read from the file and passed through the environment. It is
 * never printed, never logged, and never written into the dump.
 *
 * This script only ever READS production. T-AV0's hard line permits read-only
 * recon before the merge and nothing else, and `db dump` is read-only.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'supabase', 'av-local-schema.sql');
const REPO_SCHEMA = path.join(ROOT, 'supabase', 'schema.sql');
const TOKEN_FILE = path.join(homedir(), '.supabase', 'access-token');

const dbUrl = process.env.SUPABASE_DB_URL ?? '';

const env = { ...process.env };
if (existsSync(TOKEN_FILE)) {
  env.SUPABASE_ACCESS_TOKEN = readFileSync(TOKEN_FILE, 'utf8').trim();
}

// `supabase db dump` is schema-only BY DEFAULT -- there is no --schema-only
// flag, and passing one makes the CLI print its usage and exit non-zero, which
// reads exactly like a permissions failure. `--data-only` is the opposite of
// what we want and is never passed here.
const args = ['db', 'dump'];
if (dbUrl) args.push('--db-url', dbUrl);
else args.push('--linked');

// Guard the redaction: `''.replace('')` inserts at position 0 rather than
// doing nothing, so an unset SUPABASE_DB_URL would print `<db-url>db dump`.
const shown = dbUrl ? args.join(' ').replace(dbUrl, '<db-url>') : args.join(' ');
console.log(`av:schema:pull -> supabase ${shown}`);

const dump = spawnSync('supabase', args, { cwd: ROOT, encoding: 'utf8', env });

if (dump.status !== 0) {
  // Redact anything that looks like a connection string before echoing the CLI.
  const stderr = (dump.stderr ?? '').replace(/postgres(ql)?:\/\/[^\s"']+/g, '<db-url>');
  console.error(
    `av:schema:pull FAILED. The production schema was NOT pulled and\n` +
      `supabase/av-local-schema.sql has been left exactly as it was.\n\n` +
      `supabase said:\n${stderr.trim()}\n\n` +
      `Both known ways to give it what it needs:\n` +
      `  1. a PAT with projects_read + the project's database password:\n` +
      `       supabase link --project-ref <ref> && npm run av:schema:pull\n` +
      `  2. the direct connection string:\n` +
      `       SUPABASE_DB_URL='postgresql://...' npm run av:schema:pull\n\n` +
      `Until then the local stack is NOT production's shape. Say so in any\n` +
      `report that rests on it -- a local pass against a different schema is\n` +
      `a confident answer about the wrong database.\n`
  );
  process.exit(1);
}

const sql = dump.stdout ?? '';
if (sql.trim().length < 200) {
  // A read that returns almost nothing is a read that failed quietly. Assert
  // the read SUCCEEDED before asserting anything about what it found.
  console.error(
    `av:schema:pull FAILED: the dump is ${sql.length} bytes, which is not a schema.\n` +
      `Refusing to overwrite ${path.relative(ROOT, OUT)} with it.\n`
  );
  process.exit(1);
}

writeFileSync(OUT, sql);

const tables = [...sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([^\s(]+)/gi)].map((m) => m[1]);
const functions = (sql.match(/CREATE (OR REPLACE )?FUNCTION/gi) ?? []).length;
const policies = (sql.match(/CREATE POLICY/gi) ?? []).length;

console.log(
  `av:schema:pull OK: ${sql.length} bytes -> ${path.relative(ROOT, OUT)}\n` +
    `  tables=${tables.length} functions=${functions} policies=${policies}`
);

// ── drift against the repo's own schema.sql ────────────────────────────────
if (!existsSync(REPO_SCHEMA)) process.exit(0);

const repoSql = readFileSync(REPO_SCHEMA, 'utf8');
const repoTables = new Set(
  [...repoSql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([^\s(]+)/gi)].map((m) =>
    m[1].replace(/"/g, '').replace(/^public\./, '')
  )
);
const prodTables = new Set(
  tables.map((t) => t.replace(/"/g, '').replace(/^public\./, '')).filter((t) => !t.includes('.'))
);

const onlyInProd = [...prodTables].filter((t) => !repoTables.has(t)).sort();
const onlyInRepo = [...repoTables].filter((t) => !prodTables.has(t)).sort();

console.log(
  `\nDRIFT vs supabase/schema.sql (production wins; this is a report, not a gate)\n` +
    `  repo declares ${repoTables.size} public tables, production has ${prodTables.size}\n` +
    `  in production, absent from schema.sql (${onlyInProd.length}): ${onlyInProd.join(', ') || 'none'}\n` +
    `  in schema.sql, absent from production (${onlyInRepo.length}): ${onlyInRepo.join(', ') || 'none'}\n` +
    `\n  Table names only. Column, policy, trigger and function drift are not\n` +
    `  compared here, and the difference is not small -- say "tables differ by N"\n` +
    `  rather than "the schema differs by N", because those are two numbers.\n`
);
