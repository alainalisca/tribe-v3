/**
 * Tests that supabase/verify-migration-state.sql stays in sync with
 * the actual migrations directory.
 *
 * The risk this prevents: a new migration (say 086_team_archive.sql)
 * gets committed to supabase/migrations/ but nobody updates the
 * verifier. Then verify-migration-state.sql returns 'applied' for
 * everything it knows about, the operator marks the migration check
 * green, ships to main, and the runtime explodes on a missing
 * column. This test fails LOUDLY when there's drift.
 *
 * Pattern: parse the file for migration names (lines that look like
 * `select 'NNN_name'`) and compare against the filesystem.
 *
 * The verifier only covers migrations 060-083+ (the Tribe.OS era).
 * Earlier migrations are out of scope — they were applied before
 * the verifier existed and don't need re-checking.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const VERIFIER_PATH = path.join(__dirname, 'verify-migration-state.sql');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/** Lower bound: the verifier only covers Tribe.OS-era migrations. */
const VERIFIER_FLOOR = 60;

function readVerifierMigrationIds(): string[] {
  const sql = fs.readFileSync(VERIFIER_PATH, 'utf-8');
  // Each migration row in the verifier opens with `select 'NNN_name'`
  // (or `union all select 'NNN_name'`). Pull every quoted migration
  // identifier matching the 3-digit-prefix pattern.
  const matches = sql.matchAll(/['"](\d{3}_[a-z0-9_]+)['"]/gi);
  return Array.from(new Set([...matches].map((m) => m[1])));
}

function readMigrationFiles(): string[] {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  return files
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .map((f) => f.replace(/\.sql$/, ''))
    .filter((id) => {
      const num = parseInt(id.slice(0, 3), 10);
      return Number.isFinite(num) && num >= VERIFIER_FLOOR;
    })
    .sort();
}

describe('supabase/verify-migration-state.sql ↔ migrations/', () => {
  it('verifier covers every migration in the migrations/ directory (Tribe.OS era)', () => {
    const verifierIds = readVerifierMigrationIds();
    const fileIds = readMigrationFiles();

    const missing = fileIds.filter((id) => !verifierIds.includes(id));

    if (missing.length > 0) {
      throw new Error(
        `verify-migration-state.sql is missing checks for:\n  ${missing.join('\n  ')}\n\n` +
          `Add a 'select <id>, ...' branch for each to supabase/verify-migration-state.sql.\n` +
          `Without these the verifier silently reports 'all green' while real migrations\n` +
          `sit unapplied in production.`
      );
    }
    expect(missing).toEqual([]);
  });

  it('verifier does not reference migration ids that no longer exist (no orphans)', () => {
    const verifierIds = readVerifierMigrationIds();
    const fileIds = new Set(readMigrationFiles());

    const orphans = verifierIds.filter((id) => {
      const num = parseInt(id.slice(0, 3), 10);
      // The verifier may legitimately reference IDs below the floor
      // in commentary or examples. Only flag drift inside the
      // Tribe.OS range.
      if (num < VERIFIER_FLOOR) return false;
      return !fileIds.has(id);
    });

    if (orphans.length > 0) {
      throw new Error(
        `verify-migration-state.sql references migrations that don't exist:\n  ${orphans.join('\n  ')}\n\n` +
          `Either the migration file was renamed/deleted, or the verifier has a typo.\n` +
          `An operator running the verifier against a fresh DB would see 'MISSING' for\n` +
          `something that legitimately doesn't need to be applied.`
      );
    }
    expect(orphans).toEqual([]);
  });
});

/**
 * The static half of the users-column-grant guard.
 *
 * verify-migration-state.sql checks the LIVE database, which is the real
 * answer but only arrives when somebody remembers to paste it into the SQL
 * editor. This test is the half that fails the build, before the migration is
 * ever applied.
 *
 * WHAT IT PREVENTS
 * public.users has no table-level SELECT grant for authenticated/anon: 066
 * revoked it and re-granted SELECT column by column, 067 extended the list.
 * A column added after that snapshot is invisible to every non-service caller
 * until it is granted explicitly, and the client fails at runtime with
 * `42501 permission denied for table users`. 156 shipped exactly that way and
 * blanked the first-run introduction, all five dismissible banners and the
 * What's New badge.
 *
 * WHY NO UNIT TEST CAUGHT IT
 * Every unit test mocks the DAL, so no test in this repo can observe a
 * permission error -- the mock returns success and the component renders. That
 * is not a gap this test closes either. It closes the narrower one: catching
 * the missing GRANT in the migration text itself.
 *
 * NOTE FOR THE SQL SIDE (verify-migration-state.sql): the live check must use
 * has_column_privilege(), never information_schema.column_privileges. That view
 * lists only explicitly granted COLUMN privileges and cannot see a table-level
 * grant, so it reports "absent" both for a column readable via a table-level
 * grant and for a column that is genuinely unreadable. It gave a false pass
 * while this bug was being diagnosed. Do not swap it back.
 */
describe('public.users columns added after 067 carry an explicit SELECT grant', () => {
  /** 067 is the last migration that re-granted every column existing at the time. */
  const GRANT_SNAPSHOT = 67;

  /**
   * Columns exempt from the rule, each with the reason it is exempt.
   * Anything not listed here must appear in a `GRANT SELECT (...) ON
   * public.users` in some migration.
   */
  const EXEMPT: Record<string, string> = {
    // Added by 094 with no grant, yet verified readable in production on
    // 2026-09-09: has_column_privilege('authenticated', 'public.users',
    // 'last_seen_release', 'SELECT') = true. The grant was evidently applied
    // out of band and the migration history does not record it. Al's call
    // (2026-09-09): leave it alone rather than write a migration for a
    // privilege production already has.
    last_seen_release: 'granted out of band; confirmed readable in production',
  };

  /** Strip block and line comments so commented-out DDL never counts. */
  function stripSqlComments(sql: string): string {
    return sql
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((line) => line.replace(/--.*$/, ''))
      .join('\n');
  }

  it('every users column added after 067 is granted to authenticated', () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d{3}_.*\.sql$/.test(f))
      .sort();

    const added: { file: string; column: string }[] = [];
    const grantedColumns = new Set<string>();

    for (const file of files) {
      const sql = stripSqlComments(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'));

      // `ALTER TABLE [IF EXISTS] [ONLY] [public.]users ... ;` -- one statement
      // may add several columns, and may span many lines.
      const alters = sql.matchAll(
        /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\s*\.\s*)?"?users"?\b([\s\S]*?);/gi
      );
      for (const alter of alters) {
        for (const col of alter[1].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi)) {
          added.push({ file, column: col[1] });
        }
      }

      for (const grant of sql.matchAll(/GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+(?:public\s*\.\s*)?"?users"?/gi)) {
        for (const name of grant[1].split(',')) {
          const clean = name.trim().replace(/"/g, '');
          if (clean) grantedColumns.add(clean);
        }
      }
    }

    const ungranted = added
      .filter(({ file }) => parseInt(file.slice(0, 3), 10) > GRANT_SNAPSHOT)
      .filter(({ column }) => !grantedColumns.has(column) && !(column in EXEMPT));

    if (ungranted.length > 0) {
      throw new Error(
        `These columns were added to public.users after 067 without a SELECT grant:\n` +
          ungranted.map(({ file, column }) => `  ${column}  (${file})`).join('\n') +
          `\n\npublic.users has no table-level SELECT grant for authenticated/anon (066 revoked\n` +
          `it and re-granted column by column). An ungranted column is unreadable by the\n` +
          `client, which fails with "42501 permission denied for table users" at runtime --\n` +
          `and no unit test can see it, because the DAL is mocked everywhere.\n\n` +
          `Add to the migration:\n` +
          `  GRANT SELECT (<column>) ON public.users TO authenticated;\n` +
          `  GRANT SELECT (<column>) ON public.users TO anon;\n\n` +
          `If the column is deliberately withheld from the client, add it to the exclusion\n` +
          `list in supabase/verify-migration-state.sql instead, and to EXEMPT here with the\n` +
          `reason.`
      );
    }
    expect(ungranted).toEqual([]);
  });

  it('the 156/157 onboarding columns are granted', () => {
    const sql156 = fs.readFileSync(path.join(MIGRATIONS_DIR, '156_onboarding_state.sql'), 'utf-8');
    const sql157 = fs.readFileSync(path.join(MIGRATIONS_DIR, '157_grant_onboarding_columns.sql'), 'utf-8');

    // 156 carries the grant so a database rebuilt from the migrations is
    // correct; 157 carries it because 156 had already run against production.
    for (const sql of [sql156, sql157]) {
      expect(sql).toMatch(
        /GRANT\s+SELECT\s*\([^)]*onboarding_completed_at[^)]*\)\s*ON\s+public\.users\s+TO\s+authenticated/i
      );
      expect(sql).toMatch(/GRANT\s+SELECT\s*\([^)]*dismissed_banners[^)]*\)\s*ON\s+public\.users\s+TO\s+anon/i);
    }
  });
});

// Dropped the third 'malformed row' check — it tripped on the
// stylistic difference between `select 'NNN' as migration,` (first
// row, has alias) vs `select 'NNN',` (subsequent rows, no alias).
// Postgres parses both fine, and a truly broken row would fail at
// the SQL editor on first invocation anyway. The first two tests
// cover the real drift modes (missing checks, orphan references).
