#!/usr/bin/env node
/**
 * CLI over supabase/avMigrationCheck.ts. T-AV0, Step 3.
 *
 *   node scripts/av-migration-check.mjs [migrationsDir] [verifierSql]
 *
 * Exit 0 when every 8000-8999 migration passes, 1 otherwise. Run by
 * `npm run av:guard`, which is run by the pre-push hook.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS RE-EXECS ITSELF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The rules live in a .ts module so the unit tests exercise the SAME code this
 * CLI runs -- a second implementation in .mjs would be a check of a check.
 * That module imports `sqlWithoutComments` from supabase/executableSql.ts,
 * the repo's one SQL tokeniser, because a regex comment-stripper is wrong on
 * this repo's own files (CLAUDE.md; migration 179's abort message contains
 * `--` inside a string literal, and four guards here have already eaten their
 * author's prose).
 *
 * Plain `node` cannot import .ts. Node 22 can with --experimental-strip-types,
 * and reports it as `process.features.typescript === 'strip'`, so this file
 * re-runs itself once with the flag rather than adding a build step or a
 * transpiler dependency (T-AV0 budget: no new npm dependency).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');

if (!process.features.typescript) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', SELF, ...process.argv.slice(2)],
    { stdio: 'inherit' }
  );
  process.exit(r.status ?? 1);
}

const { checkAvMigrations, formatProblems, AV_BLOCK_MIN, AV_BLOCK_MAX } = await import(
  path.join(ROOT, 'supabase', 'avMigrationCheck.ts')
);

const dir = process.argv[2] ?? path.join(ROOT, 'supabase', 'migrations');
const verifier = process.argv[3] ?? path.join(ROOT, 'supabase', 'verify-migration-state.sql');

const { checked, problems } = checkAvMigrations(dir, verifier);

if (problems.length > 0) {
  console.error(
    `av-migration-check FAILED: ${problems.length} problem(s) in the ` +
      `${AV_BLOCK_MIN}-${AV_BLOCK_MAX} block\n\n${formatProblems(problems)}\n\n` +
      `Every T-AV migration needs a "-- PROGRAM: T-AV" line, a "-- TICKET: T-AVn"\n` +
      `line, a "-- TABLE: <name> OWNER: consumer|tribe-os|t-av-new" line per table\n` +
      `it creates or alters, a probe in supabase/verify-migration-state.sql, and no\n` +
      `DROP TABLE / DROP COLUMN / RENAME. This is a tripwire, not a proof -- a file\n` +
      `that passes it still needs a rehearsal before it goes anywhere near a database.\n`
  );
  process.exit(1);
}

// Print what was READ, not only the verdict. A check that emits only PASS is
// unfalsifiable from outside; "0 files" here is visibly different from
// "3 files" and a human catches it in one glance (CLAUDE.md, the pg_type
// join that silently read nothing and passed three instruments).
console.log(
  `av-migration-check OK: ${checked.length} migration(s) in ${AV_BLOCK_MIN}-${AV_BLOCK_MAX}` +
    (checked.length ? `: ${checked.join(', ')}` : ' (block empty)')
);
